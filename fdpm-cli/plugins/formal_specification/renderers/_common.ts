import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../../src/core/models/instance.js";
import type {
  DomainProfile,
  PrimitiveTypeDef,
} from "../../../src/core/models/meta.js";

/**
 * Shared graph-walk for the formal_specification renderers (markdown,
 * html, pdf). The output is a logical document tree:
 *
 *   doc
 *   ├── section[number=1, title="..."]
 *   │   ├── primitive (fs:Definition, fs:Phase, ...)
 *   │   └── primitive ...
 *   ├── section[number=2, ...]
 *   │   └── primitive ...
 *   ├── unsectioned[]            primitives that match no section
 *   └── bibliography[]            collected fs:Citation
 *
 * Section ordering is by `field_values.number`. Containment is
 * inferred from two sources:
 *  1. `fs:ContainedIn` relations: source primitive belongs in target Section.
 *  2. `scope_id` matching the section's id (legacy roadmap convention).
 *
 * Citations are pulled out of their containing sections and emitted as
 * a single bibliography appendix.
 */

export interface DocumentTree {
  project_id: string;
  profile: DomainProfile;
  sections: SectionBlock[];
  unsectioned: PrimitiveInstance[];
  citations: PrimitiveInstance[];
}

export interface SectionBlock {
  section: PrimitiveInstance;
  number: number;
  title: string;
  status?: string;
  description?: string;
  primitives: PrimitiveInstance[];
}

export interface RenderInput {
  projectId: string;
  primitives: readonly PrimitiveInstance[];
  relations: readonly RelationInstance[];
  profile: DomainProfile;
}

const SECTION_TYPE = "fs:Section";
const CITATION_TYPE = "fs:Citation";
const CONTAINED_IN = "fs:ContainedIn";

export function buildDocumentTree(input: RenderInput): DocumentTree {
  const sections = input.primitives
    .filter((p) => p.type_id === SECTION_TYPE)
    .slice()
    .sort((a, b) => {
      const an = Number(a.field_values["number"] ?? 0);
      const bn = Number(b.field_values["number"] ?? 0);
      if (an !== bn) return an - bn;
      return a.id.localeCompare(b.id);
    });

  const sectionIds = new Set(sections.map((s) => s.id));
  const sectionByScopeId = new Map<string, string>();
  for (const s of sections) {
    if (s.scope_id) sectionByScopeId.set(s.scope_id, s.id);
  }

  // primitiveId -> sectionId via fs:ContainedIn
  const containedIn = new Map<string, string>();
  for (const r of input.relations) {
    if (r.type_id !== CONTAINED_IN) continue;
    if (!sectionIds.has(r.target_id)) continue;
    // First wins; the FS profile lets a primitive be ContainedIn many
    // sections but renderers pick one anchor for layout. The relation's
    // metadata `is_primary` would refine this; v1 keeps it simple.
    if (!containedIn.has(r.source_id)) containedIn.set(r.source_id, r.target_id);
  }

  // Build per-section bucket.
  const buckets = new Map<string, PrimitiveInstance[]>();
  for (const s of sections) buckets.set(s.id, []);
  const citations: PrimitiveInstance[] = [];
  const unsectioned: PrimitiveInstance[] = [];

  for (const p of input.primitives) {
    if (p.type_id === SECTION_TYPE) continue;
    if (p.type_id === CITATION_TYPE) {
      citations.push(p);
      continue;
    }
    let sectionId: string | undefined = containedIn.get(p.id);
    if (!sectionId && p.scope_id) sectionId = sectionByScopeId.get(p.scope_id);
    if (sectionId && buckets.has(sectionId)) {
      buckets.get(sectionId)!.push(p);
    } else {
      unsectioned.push(p);
    }
  }

  const sortById = (a: PrimitiveInstance, b: PrimitiveInstance) =>
    a.id.localeCompare(b.id);

  citations.sort((a, b) => {
    const ay = Number(a.field_values["year"] ?? 0);
    const by = Number(b.field_values["year"] ?? 0);
    if (ay !== by) return ay - by;
    return sortById(a, b);
  });
  unsectioned.sort(sortById);
  for (const list of buckets.values()) list.sort(sortById);

  const blocks: SectionBlock[] = sections.map((s) => ({
    section: s,
    number: Number(s.field_values["number"] ?? 0),
    title: String(s.field_values["title"] ?? s.id),
    ...(typeof s.field_values["status"] === "string" && {
      status: s.field_values["status"],
    }),
    ...(typeof s.field_values["description"] === "string" && {
      description: s.field_values["description"],
    }),
    primitives: buckets.get(s.id) ?? [],
  }));

  return {
    project_id: input.projectId,
    profile: input.profile,
    sections: blocks,
    unsectioned,
    citations,
  };
}

/**
 * Field renderer: produces a `[label, valueText][]` pair list for a
 * given primitive, using the resolved profile's PrimitiveTypeDef as
 * the source of truth for field order and type.
 */
export function fieldRows(
  prim: PrimitiveInstance,
  profile: DomainProfile,
): { name: string; value: string }[] {
  const type: PrimitiveTypeDef | undefined = profile.primitive_types.find(
    (t) => t.id === prim.type_id,
  );
  const order: string[] = type ? type.fields.map((f) => f.name) : Object.keys(prim.field_values);
  const out: { name: string; value: string }[] = [];
  for (const name of order) {
    if (!(name in prim.field_values)) continue;
    out.push({ name, value: stringify(prim.field_values[name]) });
  }
  return out;
}

/** JSON-ish stringification with arrays/objects pretty-printed inline. */
export function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}

/**
 * Format a citation in a compact reference-list style (Author1, Author2.
 * "Title". Venue, Year. URL).
 */
export function formatCitation(c: PrimitiveInstance): string {
  const fv = c.field_values as Record<string, unknown>;
  const authors = Array.isArray(fv["authors"])
    ? (fv["authors"] as string[]).join(", ")
    : "—";
  const title = fv["title"] ?? "(untitled)";
  const venue = fv["venue"] ? `. ${fv["venue"]}` : "";
  const year = fv["year"] ? ` (${fv["year"]})` : "";
  const url = fv["url"] ? `. ${fv["url"]}` : "";
  return `${authors}. "${title}"${venue}${year}${url}`;
}

/** Friendly type name from the profile metadata, falling back to the id. */
export function typeLabel(typeId: string, profile: DomainProfile): string {
  const t = profile.primitive_types.find((p) => p.id === typeId);
  return t?.name ?? typeId;
}
