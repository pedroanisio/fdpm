import type { z } from "zod";
import { getObjectShape, unwrap } from "./walker.js";

export type ShapeKind = "Entity" | "ValueObject";

export type ClassificationReason =
  | "id-schema-companion"
  | "explicit-entities-list"
  | "default-value-object";

export interface ClassificationEntry {
  /** Schema name as it appears in the `schemas` map. */
  name: string;
  kind: ShapeKind;
  reason: ClassificationReason;
}

export interface ClassificationCandidate {
  name: string;
  signals: ReadonlyArray<"has-id-field" | "referenced-by-multiple">;
  /** How many other schemas reference this one (by field type identity). */
  referenceCount: number;
}

export interface AuditLog {
  classifications: ClassificationEntry[];
  /** Schemas classified as ValueObject that exhibit Entity-like signals. */
  candidatePromotions: ClassificationCandidate[];
}

export interface ClassifyArgs {
  schemas: Record<string, z.ZodObject<z.ZodRawShape>>;
  /** Names from the `schemas` map to force-classify as Entity. */
  explicitEntities?: ReadonlyArray<string>;
}

export interface ClassifyResult {
  /** Map from schema name to its classification. */
  byName: Map<string, ClassificationEntry>;
  audit: AuditLog;
}

/**
 * Hybrid classifier per workbook howto-zod-to-fdpm-plugin §4
 * (Position 3, locked 2026-05-06).
 *
 * Algorithm:
 *   1. For every key K in the schemas map, check if a sibling
 *      `KId` (or `KIdSchema`, post-strip) exists. If yes → Entity
 *      with reason="id-schema-companion".
 *   2. For every name in explicitEntities → Entity with
 *      reason="explicit-entities-list" (overrides default; is a no-op
 *      if the convention already classified it as Entity).
 *   3. Everything else → ValueObject with reason="default-value-object".
 *
 * Plus, for any ValueObject, record candidate-promotion signals:
 *   - has an `id` field (any type) → "has-id-field"
 *   - is referenced by 2+ other schemas → "referenced-by-multiple"
 *
 * Signals are advisory only; never auto-promote. The audit log
 * surfaces them so the author can decide.
 */
export function classifySchemas(args: ClassifyArgs): ClassifyResult {
  const names = new Set(Object.keys(args.schemas));
  const explicit = new Set(args.explicitEntities ?? []);

  // Pass 1 — convention detection.
  const byName = new Map<string, ClassificationEntry>();
  for (const name of names) {
    if (explicit.has(`${name}Id`)) {
      // `${name}Id` is force-marked as an Entity; that schema is the id
      // companion, not the entity itself. Skip — it'll classify on its
      // own iteration below as ValueObject.
    }
    const idCompanion = `${name}Id`;
    if (names.has(idCompanion)) {
      byName.set(name, {
        name,
        kind: "Entity",
        reason: "id-schema-companion",
      });
    }
  }

  // Pass 2 — explicit list promotions.
  for (const name of explicit) {
    if (!names.has(name)) {
      throw new Error(
        `entities list contains '${name}' but it is not in the schemas map; entries must reference declared schemas`,
      );
    }
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        kind: "Entity",
        reason: "explicit-entities-list",
      });
    }
  }

  // Pass 3 — default ValueObject for everything else.
  for (const name of names) {
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        kind: "ValueObject",
        reason: "default-value-object",
      });
    }
  }

  // Audit: candidate promotions for ValueObjects.
  const referenceCount = countCrossSchemaReferences(args.schemas);
  const candidatePromotions: ClassificationCandidate[] = [];
  for (const entry of byName.values()) {
    if (entry.kind === "Entity") continue;
    const signals: Array<"has-id-field" | "referenced-by-multiple"> = [];
    const schema = args.schemas[entry.name];
    if (schema && hasIdField(schema)) signals.push("has-id-field");
    const refs = referenceCount.get(entry.name) ?? 0;
    if (refs >= 2) signals.push("referenced-by-multiple");
    if (signals.length > 0) {
      candidatePromotions.push({
        name: entry.name,
        signals,
        referenceCount: refs,
      });
    }
  }

  return {
    byName,
    audit: {
      classifications: Array.from(byName.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      candidatePromotions: candidatePromotions.sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    },
  };
}

/** Does the schema's top-level shape declare an `id` field? */
function hasIdField(schema: z.ZodObject<z.ZodRawShape>): boolean {
  const shape = getObjectShape(schema);
  if (!shape) return false;
  return Object.prototype.hasOwnProperty.call(shape, "id");
}

/**
 * Count, for each name N in the schemas map, how many *other* schemas
 * reference N's value-shape via field identity. Reference detection is
 * by `===` of the unwrapped Zod node — same module, same definition.
 *
 * Note: this misses references via name-only lookups (the host has no
 * imports table; we can only see what the schemas map gives us). Acts
 * as a lower bound on cross-schema reuse.
 */
function countCrossSchemaReferences(
  schemas: Record<string, z.ZodObject<z.ZodRawShape>>,
): Map<string, number> {
  const refIdToName = new Map<z.ZodType, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    refIdToName.set(schema, name);
  }
  const counts = new Map<string, number>();
  for (const [parentName, schema] of Object.entries(schemas)) {
    const visited = new WeakSet<z.ZodType>();
    walk(schema, parentName);
    function walk(node: z.ZodType, parent: string): void {
      if (visited.has(node)) return;
      visited.add(node);
      const u = unwrap(node);
      const named = refIdToName.get(u.inner);
      if (named && named !== parent) {
        counts.set(named, (counts.get(named) ?? 0) + 1);
      }
      const shape = getObjectShape(u.inner);
      if (shape) {
        for (const child of Object.values(shape)) walk(child, parent);
      }
      const arrayElement = (u.inner as unknown as { _def?: { element?: z.ZodType } })._def?.element;
      if (arrayElement) walk(arrayElement, parent);
    }
  }
  return counts;
}

/** Render the audit log as a human-readable report. */
export function renderAuditLog(audit: AuditLog): string {
  const out: string[] = [];
  out.push(`Bridge classification (${audit.classifications.length} schemas):`);
  const byKind = new Map<ShapeKind, ClassificationEntry[]>();
  for (const e of audit.classifications) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  for (const kind of ["Entity", "ValueObject"] as const) {
    const list = byKind.get(kind) ?? [];
    if (list.length === 0) continue;
    out.push(`  ${kind} (${list.length}):`);
    for (const e of list) {
      out.push(`    ${e.name}  [${e.reason}]`);
    }
  }
  if (audit.candidatePromotions.length > 0) {
    out.push("");
    out.push(
      `Candidate ValueObjects with Entity-like signals (${audit.candidatePromotions.length}) — consider adding to options.entities:`,
    );
    for (const c of audit.candidatePromotions) {
      out.push(
        `  ${c.name}  [${c.signals.join(", ")}; referenced by ${c.referenceCount} other schema(s)]`,
      );
    }
  }
  return out.join("\n");
}
