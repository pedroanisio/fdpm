import { createHash } from "node:crypto";
import type { RelationInstance } from "../models/instance.js";

export interface ExprRuntimeHelperContext {
  projectPrimitiveCountByType: ReadonlyMap<string, number>;
  locale: string;
  listIterationCap: number;
  outputStringCap: number;
  evaluateSortByKey(iterVar: string, keyExpr: string, item: unknown): unknown;
  /**
   * Render-time only: a map from dnis:Node id (the SPEC-DNIS NID, plus
   * its slug-form SPEC-CORE primitive id 'dnis:node:<lower nid>') to the
   * §N.M.K heading the renderer assigns. Populated by the spec_md
   * renderer's DFS over the dnis:Node graph per SPEC-SECTIONS-TREE v0.2.
   * Empty (never undefined) at validate-time and on render paths that do
   * not contain a dnis:Document.
   *
   * Consumed by `fn.section_of(node_id)` (helper-set v1.2.0).
   */
  sectionIndex: ReadonlyMap<string, string>;
}

/**
 * Resolve a dnis:Node id to its rendered §N.M.K heading via the
 * render-time `sectionIndex` (helper-set v1.2.0, SPEC-SECTIONS-TREE v0.2
 * §6.4 fn.section_of). Throws on unknown ids — never silently coerces
 * to '' (Principle 4 of SPEC-RENDER-DSL).
 *
 * The lookup tries the input verbatim first, then a slug-form fallback
 * ('dnis:node:<lower(nodeId)>'), so callers can pass either the bare
 * NID or the SPEC-CORE primitive id.
 */
export function resolveSectionOf(
  index: ReadonlyMap<string, string>,
  nodeId: unknown,
): string {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new Error("type-error: fn.section_of expects a non-empty string node_id");
  }
  const direct = index.get(nodeId);
  if (direct !== undefined) return direct;
  // Slug fallback: callers passing a bare NID get the slug form lookup.
  const slug = `dnis:node:${nodeId.toLowerCase()}`;
  const fromSlug = index.get(slug);
  if (fromSlug !== undefined) return fromSlug;
  throw new Error(
    `unknown-name: fn.section_of: no rendered section for '${nodeId}'. The renderer either did not visit a dnis:Node with this id, or the id was retired before render time.`,
  );
}

/**
 * Minimal id-bearer used by the existence helpers. PrimitiveInstance and
 * the activation's mapped ExprPrimitiveValue both satisfy this.
 */
export interface HasId {
  readonly id: string;
}

/**
 * Existence check used by `graph.exists(target_id)` (SPEC-EXPRESSION-RUNTIME
 * §M14, helper-set v1.1.0). True iff some primitive in `primitives` has the
 * given id. Pure; the caller is responsible for passing the project's
 * primitive set.
 */
export function primitiveExists(
  primitives: readonly HasId[],
  target_id: string,
): boolean {
  for (const p of primitives) {
    if (p.id === target_id) return true;
  }
  return false;
}

/**
 * Reachability check used by `graph.target_exists(rel_id)` (SPEC-EXPRESSION-
 * RUNTIME §M14, helper-set v1.1.0). True iff EVERY outgoing relation of
 * type `rel_id` from `source_id` points at a primitive that exists in
 * `primitives`. An instance with zero outgoing relations of that type
 * returns true vacuously — callers can guard with `outgoing(rel_id).size()
 * >= 1` when they need a non-empty contract.
 *
 * Pure: scans `relations` once, then `primitives` once per matching edge.
 * For predicates that fire on every Host write, the cost is O(R + Eᵢ·P)
 * where Eᵢ is the small per-instance fan-out of the named relation type.
 */
export function targetsExist(
  relations: readonly RelationInstance[],
  primitives: readonly HasId[],
  source_id: string,
  type_id: string,
): boolean {
  const ids = new Set<string>();
  for (const p of primitives) ids.add(p.id);
  for (const r of relations) {
    if (r.type_id !== type_id) continue;
    if (r.source_id !== source_id) continue;
    if (!ids.has(r.target_id)) return false;
  }
  return true;
}

export function getOutgoing(
  relations: readonly RelationInstance[],
  source_id: string,
  type_id: string,
): string[] {
  return relations
    .filter((r) => r.type_id === type_id && r.source_id === source_id)
    .map((r) => r.target_id);
}

export function getIncoming(
  relations: readonly RelationInstance[],
  target_id: string,
  type_id: string,
): string[] {
  return relations
    .filter((r) => r.type_id === type_id && r.target_id === target_id)
    .map((r) => r.source_id);
}

export function isAcyclic(
  relations: readonly RelationInstance[],
  start_id: string,
  type_id: string,
): boolean {
  const adj = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type_id !== type_id) continue;
    const list = adj.get(r.source_id) ?? [];
    list.push(r.target_id);
    adj.set(r.source_id, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return false;
    if (visited.has(node)) return true;

    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (!dfs(next)) return false;
    }
    visiting.delete(node);
    visited.add(node);
    return true;
  };

  return dfs(start_id);
}

export function upper(value: unknown): string {
  return String(value ?? "").toUpperCase();
}

export function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function title(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(\p{L})/gu, (match) => match.toUpperCase());
}

export function trim(value: unknown): string {
  return String(value ?? "").trim();
}

export function slice(value: unknown, start: unknown, end?: unknown): string {
  const chars = Array.from(String(value ?? ""));
  const begin = toInteger(start);
  const until = end === undefined ? undefined : toInteger(end);
  return chars.slice(begin, until).join("");
}

export function replace(value: unknown, find: unknown, replacement: unknown): string {
  return String(value ?? "").replace(String(find ?? ""), String(replacement ?? ""));
}

export function len(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return Array.from(value).length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  return String(value).length;
}

export function count(typeId: unknown, ctx: ExprRuntimeHelperContext): number {
  return ctx.projectPrimitiveCountByType.get(String(typeId)) ?? 0;
}

export function plural(countValue: unknown, singular: unknown, pluralForm?: unknown): string {
  const countNumber = Number(countValue ?? 0);
  if (countNumber === 1) return String(singular ?? "");
  if (pluralForm !== undefined) return String(pluralForm);
  return `${String(singular ?? "")}s`;
}

export function dateShort(value: unknown): string {
  return normalizeIso(value).slice(0, 10);
}

export function dateLong(value: unknown, ctx: ExprRuntimeHelperContext): string {
  const date = new Date(normalizeIso(value));
  return new Intl.DateTimeFormat(ctx.locale || "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function dateIso(value: unknown): string {
  return new Date(normalizeIso(value)).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function hashValue(value: unknown): string {
  return digest(hashCanonical(value));
}

export function sortBy(
  value: unknown,
  iterVar: unknown,
  keyExpr: unknown,
  ctx: ExprRuntimeHelperContext,
): unknown[] {
  if (!Array.isArray(value)) return [];
  if (value.length > ctx.listIterationCap) {
    throw new Error(
      `bound-exceeded: fn.sortBy iteration cap ${ctx.listIterationCap} exceeded (${value.length})`,
    );
  }
  const iterName = String(iterVar ?? "").trim();
  const keySource = String(keyExpr ?? "").trim();
  if (!iterName) {
    throw new Error("type-error: fn.sortBy requires a non-empty iteration variable");
  }
  const decorated = value.map((item, index) => ({
    item,
    index,
    key: ctx.evaluateSortByKey(iterName, keySource, item),
  }));
  decorated.sort((left, right) => compareSortKeys(left.key, right.key) || left.index - right.index);
  return decorated.map((entry) => entry.item);
}

export function assertHelperOutputStringCap(
  value: string,
  helperId: string,
  ctx: ExprRuntimeHelperContext,
): string {
  if (Array.from(value).length > ctx.outputStringCap) {
    throw new Error(
      `bound-exceeded: ${helperId} output string cap ${ctx.outputStringCap} exceeded`,
    );
  }
  return value;
}

function normalizeIso(value: unknown): string {
  const text = String(value ?? "");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`type-error: invalid ISO datetime: ${text}`);
  }
  return date.toISOString();
}

function toInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function hashCanonical(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (Number.isNaN(value)) throw new Error("type-error: fn.hash does not accept NaN");
    if (Object.is(value, -0)) return "0";
    return `${value}`;
  }
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) {
    return value.map((item) => digest(hashCanonical(item))).join("");
  }
  throw new Error("type-error: fn.hash does not accept maps in v1.0.0");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareSortKeys(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}
