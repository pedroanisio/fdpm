/**
 * Pure derivation logic that turns a resolved `ProfileDetail` (the schema a
 * plugin contributes) into a `ProfileDocumentModel`: an ordered, normalized,
 * render-agnostic description of a polished profile-reference document.
 *
 * This module holds ALL logic that is worth testing in isolation — enum
 * parsing, type-list normalization, field description, and the assembly of
 * the document model. The React layer (`ProfileDocument.tsx`) is a thin,
 * declarative projection of the model produced here and carries no logic.
 *
 * Keeping the transformation pure (no DOM, no React, no `Date` capture unless
 * injected) makes the document contract deterministic and unit-testable.
 */
import type {
  ProfileDetail,
  ProfileField,
  ProfileIdFormat,
  ProfilePrimitiveType,
  ProfileRelationType,
} from "../types";

/** A field normalized for display: kind label, optional enum values, raw type. */
export interface DocField {
  name: string;
  /** Human display label for the field's type (its `kind`, e.g. "enum"). */
  typeLabel: string;
  /** The underlying `legacy_type` string, when it adds information. */
  rawType?: string;
  required: boolean;
  description?: string;
  /** Parsed enum members when `kind === "enum"`, else null. */
  enumValues: string[] | null;
}

export interface DocIdFormat {
  pattern: string;
  patternKind: string;
  uniqueness: string;
}

export interface DocPrimitive {
  id: string;
  name: string;
  category?: string;
  description?: string;
  scoped: boolean;
  idFormat: DocIdFormat | null;
  fields: DocField[];
}

export interface DocRelation {
  id: string;
  name: string;
  description?: string;
  sources: string[];
  targets: string[];
  fields: DocField[];
}

export interface DocTotals {
  primitiveTypes: number;
  relationTypes: number;
  fields: number;
  requiredFields: number;
}

export interface ProfileDocumentModel {
  id: string;
  title: string;
  version: string;
  description?: string;
  extends: string[];
  totals: DocTotals;
  primitives: DocPrimitive[];
  relations: DocRelation[];
  /** ISO-8601 timestamp the document was generated (injected, for determinism). */
  generatedAt: string;
}

/** Standing provenance line embedded in every exported document. */
export const DOCUMENT_GENERATOR = "FDPM web · profile document export";

/**
 * The project-wide epistemic disclaimer (CLAUDE.md §5), embedded verbatim in
 * the document footer so exported PDFs carry the same notice as `.md` docs.
 */
export const DOCUMENT_DISCLAIMER =
  "No information within this document should be taken for granted. Any statement " +
  "or premise not backed by a real logical definition or verifiable reference may " +
  "be invalid, erroneous, or a hallucination. This document is generated mechanically " +
  "from the registered profile definition and is not a validation of it.";

/**
 * Normalize a `source_types` / `target_types` value. Plugins emit either a
 * single string, an array, or the wildcard `"*"`; callers always want an
 * array. Order is preserved; duplicates are dropped.
 */
export function normalizeTypeList(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (t === "" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Extract enum members from a `legacy_type` such as
 * `Enum["stable", "draft", "deprecated"]` or `Enum[5, 10, 15]`.
 * Returns null when the string is not an `Enum[...]` form.
 *
 * Values are assumed not to contain commas (true for every value observed in
 * the built-in profiles); a top-level split on `,` is therefore sufficient.
 */
export function parseEnumValues(legacyType: string | undefined): string[] | null {
  if (!legacyType) return null;
  const m = /^Enum\[(.*)\]$/s.exec(legacyType.trim());
  if (!m) return null;
  const inner = m[1].trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((part) => stripQuotes(part.trim()))
    .filter((part) => part !== "");
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Whether a field's raw `legacy_type` carries information beyond its `kind`. */
function rawTypeIfInformative(field: ProfileField): string | undefined {
  const raw = field.legacy_type?.trim();
  if (!raw) return undefined;
  // `kind` already conveys these; the raw form is noise for a reader.
  if (raw.toLowerCase() === field.kind.toLowerCase()) return undefined;
  if (field.kind === "enum") return undefined; // enum values shown separately
  return raw;
}

/** Normalize one profile field into its document projection. */
export function describeField(field: ProfileField): DocField {
  return {
    name: field.name,
    typeLabel: field.kind,
    rawType: rawTypeIfInformative(field),
    required: Boolean(field.required),
    description: field.description?.trim() || undefined,
    enumValues: field.kind === "enum" ? parseEnumValues(field.legacy_type) : null,
  };
}

function toDocIdFormat(idf: ProfileIdFormat | undefined): DocIdFormat | null {
  if (!idf) return null;
  return {
    pattern: idf.pattern,
    patternKind: idf.pattern_kind,
    uniqueness: idf.uniqueness,
  };
}

function toDocPrimitive(t: ProfilePrimitiveType): DocPrimitive {
  return {
    id: t.id,
    name: t.name || t.id,
    category: t.category ?? t.category_id,
    description: t.description?.trim() || undefined,
    scoped: Boolean(t.scoped),
    idFormat: toDocIdFormat(t.id_format),
    fields: (t.fields ?? []).map(describeField),
  };
}

function toDocRelation(t: ProfileRelationType): DocRelation {
  return {
    id: t.id,
    name: t.name || t.id,
    description: t.description?.trim() || undefined,
    sources: normalizeTypeList(t.source_types),
    targets: normalizeTypeList(t.target_types),
    fields: (t.fields ?? []).map(describeField),
  };
}

/**
 * Assemble the full document model from a resolved profile.
 *
 * @param profile      resolved `ProfileDetail` (from `/api/profiles/:id`)
 * @param generatedAt  timestamp to stamp on the document; injected so callers
 *                     (and tests) control it. Defaults are the caller's job —
 *                     this function requires it explicitly for determinism.
 */
export function buildProfileDocumentModel(
  profile: ProfileDetail,
  generatedAt: Date,
): ProfileDocumentModel {
  const primitives = (profile.primitive_types ?? []).map(toDocPrimitive);
  const relations = (profile.relation_types ?? []).map(toDocRelation);

  let fields = 0;
  let requiredFields = 0;
  for (const p of primitives) {
    for (const f of p.fields) {
      fields += 1;
      if (f.required) requiredFields += 1;
    }
  }
  for (const r of relations) {
    for (const f of r.fields) {
      fields += 1;
      if (f.required) requiredFields += 1;
    }
  }

  return {
    id: profile.id,
    title: profile.label || profile.name || profile.id,
    version: profile.version,
    description: profile.description?.trim() || undefined,
    extends: normalizeTypeList(profile.extends),
    totals: {
      primitiveTypes: primitives.length,
      relationTypes: relations.length,
      fields,
      requiredFields,
    },
    primitives,
    relations,
    generatedAt: generatedAt.toISOString(),
  };
}

/**
 * A stable, filesystem-safe base name for the exported document, used to set
 * `document.title` before `window.print()` so the browser's "Save as PDF"
 * dialog suggests a meaningful filename.
 */
export function documentTitle(profile: Pick<ProfileDetail, "id" | "label" | "name">): string {
  const label = profile.label || profile.name || profile.id;
  return `${label} — Profile Reference`;
}
