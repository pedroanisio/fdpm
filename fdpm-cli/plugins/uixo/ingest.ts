/**
 * Ingest a UIXO document — in the source schema's own shape — into an FDPM
 * workbook on profile:uixo:1.2.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * ⚠ ARCHITECTURAL CONTRACT (PALS's LAW) — the document is untrusted input
 * regardless of who produced it (an authoring tool, an RDF projection, or
 * a model asked to draft an interface). The five controls:
 *
 *  1. TYPED PARSE. Every node is parsed against the ontology class its own
 *     `type` names, using the SOURCE schema (edges included) — not the
 *     edge-stripped profile schema. A node whose `type` is not a
 *     registered class, or which carries an unknown field, is rejected;
 *     the source schemas are `.strict()`.
 *  2. SEMANTIC VALIDATION. Ids are unique; every edge target resolves to a
 *     node in the document; every edge target satisfies the property's RDF
 *     range through CLASS_PARENT. Then the projected workbook is run
 *     through `validateUixoWorkbook` — the whole graph-level invariant set
 *     — BEFORE a single write.
 *  3. DEFINED FAILURE PATH. Any failure throws a `verification`
 *     FDPMException naming every offending path, and writes nothing. No
 *     coercion, no defaulting, no `catch {}`.
 *  4. FAILURE-PATH TESTS. tests/plugins/uixo/referential-integrity.test.ts
 *     feeds dangling, out-of-range, duplicated and cyclic documents and
 *     asserts the rejection.
 *  5. DETERMINISTIC BOUNDS. No loop's termination depends on input
 *     content: every traversal is over a finite parsed array, and the
 *     cycle walks in ./invariants.ts carry their own visited sets.
 *
 * After all that, every write still runs the host's §7 pipeline, which
 * re-validates each primitive against the generated Zod validator and
 * refuses any relation whose endpoint is absent. The checks here are not a
 * substitute; they exist because the host validates one write at a time
 * and cannot see the document.
 */

import { z } from "zod";
import type { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import { defineProject, type PrimitiveSpec, type RelationSpec } from "../../src/sdk.js";
import { validateUixoDocument } from "./schemas/uixo-native.js";
import { PROFILE_ID, VENDOR } from "./sidecar.js";
import {
  collectEdgeFields,
  entityName,
  rangeClosure,
  relationTypeId,
  type QName,
} from "./derive.js";
import { UIXO_ENTITY_SCHEMAS } from "./schemas/uixo-native.js";
import {
  validateUixoWorkbook,
  type PrimitiveLike,
  type RelationLike,
} from "./invariants.js";

const SOURCE_SCHEMAS = UIXO_ENTITY_SCHEMAS as unknown as Record<QName, z.ZodType>;

/**
 * The document envelope. Nodes are validated one at a time against the
 * class their own `type` names, so the envelope keeps them opaque here.
 */
export const UixoDocumentInput = z
  .object({
    schemaVersion: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    /**
     * `entities`, because that is what the source document shape declares
     * (uixo-native.ts `UixoDocumentShape`) and what every real document
     * carries. This field was `nodes`, which made a document the source
     * oracle accepts unreadable here — the envelope is the source's to
     * define, not ours.
     */
    entities: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .strict();

export type UixoDocumentInputType = z.infer<typeof UixoDocumentInput>;

interface Finding {
  path: string;
  message: string;
}

/** field -> the set of primitive type ids that field may point at. */
const RANGE_BY_FIELD: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const byField = new Map<string, Set<QName>>();
  for (const e of collectEdgeFields()) {
    const bucket = byField.get(e.field) ?? new Set<QName>();
    for (const t of rangeClosure(e.range)) bucket.add(t);
    byField.set(e.field, bucket);
  }
  const out = new Map<string, ReadonlySet<string>>();
  for (const [field, qnames] of byField) {
    // An empty closure is the owl:Thing open-world top: any class goes.
    out.set(field, qnames.size === 0 ? new Set<string>() : new Set(qnames));
  }
  return out;
})();

/** Every edge field name the ontology declares, for node partitioning. */
const EDGE_FIELDS: ReadonlySet<string> = new Set(collectEdgeFields().map((e) => e.field));

/**
 * Parse and check a document. Returns the typed nodes or throws a
 * `verification` FDPMException carrying every finding.
 */
export function parseUixoDocument(input: unknown): {
  doc: UixoDocumentInputType;
  nodes: { qname: QName; id: string; values: Record<string, unknown> }[];
} {
  const parsed = UixoDocumentInput.safeParse(input);
  if (!parsed.success) {
    throw new FDPMException(
      "verification",
      `UIXO document rejected by UixoDocumentInput (${parsed.error.issues.length} issue(s)); first: ${parsed.error.issues[0]?.path.join(".") || "<root>"}: ${parsed.error.issues[0]?.message ?? ""}`,
      { findings: parsed.error.issues, evidence: { issue_count: parsed.error.issues.length } },
    );
  }
  const doc = parsed.data;

  // ── Control 0: the source oracle is the authority. ──
  // uixo-native.ts ships `validateUixoDocument` — 41 coded checks across
  // four tiers (structural, referential, semantic, policy), including the
  // state-machine, status-family and conditional rules this plugin does
  // not otherwise carry. It was vendored and never called, so a document
  // could satisfy every check here and still violate the ontology it
  // claims to speak. Run it first, and report in its own vocabulary: an
  // operator who fixes an E-code should be able to look it up in
  // UIXO_ERRORS.
  const oracle = validateUixoDocument(input);
  if (!oracle.ok) {
    const issues = Object.values(oracle.tiers).flat();
    const first = issues[0]!;
    throw new FDPMException(
      "verification",
      `UIXO document rejected by the source oracle (${issues.length} issue(s) across ${Object.entries(oracle.tiers).filter(([, v]) => v.length > 0).map(([t]) => t).join(", ")}); first: ${first.code} at ${first.path.join(".") || "<root>"}: ${first.message} — fix: ${first.fix}`,
      {
        findings: issues.map((i) => ({
          path: i.path.join("."),
          message: `${i.code} [${i.tier}] ${i.message} — fix: ${i.fix}`,
        })),
        evidence: {
          issue_count: issues.length,
          codes: [...new Set(issues.map((i) => i.code))],
          by_tier: Object.fromEntries(Object.entries(oracle.tiers).map(([t, v]) => [t, v.length])),
        },
      },
    );
  }

  const findings: Finding[] = [];
  const nodes: { qname: QName; id: string; values: Record<string, unknown> }[] = [];
  const seen = new Map<string, number>();

  // ── Control 1: typed parse, per node, against its own class. ──
  doc.entities.forEach((raw, i) => {
    const at = `nodes[${i}]`;
    const type = raw["type"];
    if (typeof type !== "string") {
      findings.push({ path: `${at}.type`, message: "every node must carry a string `type`" });
      return;
    }
    const schema = SOURCE_SCHEMAS[type];
    if (!schema) {
      findings.push({ path: `${at}.type`, message: `"${type}" is not a class of this ontology` });
      return;
    }
    const node = schema.safeParse(raw);
    if (!node.success) {
      for (const issue of node.error.issues) {
        findings.push({
          path: `${at}${issue.path.length > 0 ? "." + issue.path.map(String).join(".") : ""}`,
          message: `${type}: ${issue.message}`,
        });
      }
      return;
    }
    const values = node.data as Record<string, unknown>;
    const id = values["id"] as string;
    const prior = seen.get(id);
    if (prior !== undefined) {
      findings.push({ path: `${at}.id`, message: `duplicate entity id "${id}" (also at nodes[${prior}])` });
    }
    seen.set(id, i);
    nodes.push({ qname: type, id, values });
  });

  // ── Control 2: referential validity and range conformance. ──
  const typeOf = new Map(nodes.map((n) => [n.id, n.qname]));
  for (const n of nodes) {
    for (const [field, value] of Object.entries(n.values)) {
      if (!EDGE_FIELDS.has(field) || !Array.isArray(value)) continue;
      const legal = RANGE_BY_FIELD.get(field);
      value.forEach((target, j) => {
        if (typeof target !== "string") return;
        const targetType = typeOf.get(target);
        if (targetType === undefined) {
          findings.push({
            path: `${n.id}.${field}[${j}]`,
            message: `references "${target}", which is not a node of this document`,
          });
          return;
        }
        // An empty legal set is owl:Thing — existence is all the ontology
        // asserts, so range conformance is vacuously satisfied.
        if (legal && legal.size > 0 && !legal.has(targetType)) {
          findings.push({
            path: `${n.id}.${field}[${j}]`,
            message: `references a ${targetType}, which is outside the declared range of ${field}`,
          });
        }
      });
    }
  }

  if (findings.length > 0) {
    throw new FDPMException(
      "verification",
      `UIXO document failed verification (${findings.length} finding(s)); first: ${findings[0]!.path}: ${findings[0]!.message}`,
      { findings, evidence: { finding_count: findings.length } },
    );
  }
  return { doc, nodes };
}

// ── Projection ─────────────────────────────────────────────────────────

export interface IngestOptions {
  workbookId: string;
  workbookName?: string;
  description?: string;
}

export interface IngestReport {
  workbookId: string;
  profileId: string;
  primitives: number;
  relations: number;
  /** Primitive type id → count. */
  byType: Record<string, number>;
}

export interface Projection {
  primitives: PrimitiveSpec[];
  relations: RelationSpec[];
  byType: Record<string, number>;
}

/** Slugify an ontology entity id for use in a primitive id segment. */
function idSlug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, "-");
}

/**
 * Split each node into its attributes (the primitive) and its edges (the
 * relations). This is the mirror of ../derive.ts: derive.ts removes the
 * edge fields from the SCHEMA, this removes them from the DATA.
 */
export function projectUixoDocument(
  nodes: readonly { qname: QName; id: string; values: Record<string, unknown> }[],
): Projection {
  const primitives: PrimitiveSpec[] = [];
  const relations: RelationSpec[] = [];
  const byType: Record<string, number> = {};
  const primitiveIdOf = new Map<string, string>();

  for (const n of nodes) {
    const entity = entityName(n.qname);
    const pid = `${VENDOR}:${entity}:${idSlug(n.id)}`;
    primitiveIdOf.set(n.id, pid);
  }

  for (const n of nodes) {
    const entity = entityName(n.qname);
    const typeId = `${VENDOR}:${entity}`;
    const pid = primitiveIdOf.get(n.id)!;

    // Attributes only. The edges were lifted into relations by
    // ../derive.ts, so they are dropped from the primitive here — the
    // mirror of that lift, applied to the data. Names pass through
    // unchanged: the profile declares the ontology's own property names.
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.values)) {
      if (EDGE_FIELDS.has(k) && Array.isArray(v)) continue;
      if (v === undefined) continue;
      fields[k] = v;
    }
    primitives.push({ id: pid, type: typeId, fields });
    byType[typeId] = (byType[typeId] ?? 0) + 1;

    for (const [field, value] of Object.entries(n.values)) {
      if (!EDGE_FIELDS.has(field) || !Array.isArray(value)) continue;
      value.forEach((target, j) => {
        if (typeof target !== "string") return;
        const tid = primitiveIdOf.get(target);
        if (tid === undefined) return; // unreachable: parse already checked
        relations.push({
          id: `${VENDOR}:${idSlug(field)}:${idSlug(n.id)}--${idSlug(target)}-${j}`,
          type: relationTypeId(field),
          from: pid,
          to: tid,
        });
      });
    }
  }

  return { primitives, relations, byType };
}

/** Run the graph-level invariants over a projection, before any write. */
export function assertProjectionInvariants(projection: Projection): void {
  const primitives: PrimitiveLike[] = projection.primitives.map((p) => ({
    id: p.id,
    type_id: p.type,
    field_values: p.fields,
  }));
  const relations: RelationLike[] = projection.relations.map((r) => ({
    id: r.id,
    type_id: r.type,
    source_id: r.from,
    target_id: r.to,
  }));
  const result = validateUixoWorkbook(primitives, relations);
  if (!result.ok) {
    throw new FDPMException(
      "verification",
      `UIXO document violates ${result.violations.length} graph invariant(s); first: ${result.violations[0]!.rule_id}: ${result.violations[0]!.message}`,
      { findings: result.violations, evidence: { violation_count: result.violations.length } },
    );
  }
}

/**
 * Parse, verify, project, verify again, then write. Nothing reaches the
 * host until every check above has passed.
 */
export async function buildUixoWorkbook(
  host: Host,
  input: unknown,
  opts: IngestOptions,
): Promise<IngestReport> {
  const { doc, nodes } = parseUixoDocument(input);
  const projection = projectUixoDocument(nodes);
  assertProjectionInvariants(projection);

  await defineProject(host, {
    id: opts.workbookId,
    name: opts.workbookName ?? `UIXO document (${nodes.length} entities)`,
    profile: PROFILE_ID,
    description:
      opts.description ??
      `UIXO ${doc.schemaVersion ?? "1.2.0"} document — ${nodes.length} entities, ${projection.relations.length} edges.`,
  })
    .primitives(projection.primitives)
    .relations(projection.relations)
    .commit();

  const slice = host.getProject(opts.workbookId);
  return {
    workbookId: opts.workbookId,
    profileId: PROFILE_ID,
    primitives: Object.keys(slice.primitives).length,
    relations: Object.keys(slice.relations).length,
    byType: projection.byType,
  };
}
