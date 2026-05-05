import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../../src/core/models/instance.js";
import type {
  DomainProfile,
  PrimitiveTypeDef,
} from "../../../src/core/models/meta.js";
import type { RenderFinding } from "../../../src/core/render/template.js";

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
  /**
   * Renderer-level findings emitted while building the tree. Currently
   * used to surface mixed-mode warnings (project carries both fs:Section
   * AND dnis:Node sections). Empty list = clean.
   */
  findings: RenderFinding[];
}

export interface SectionBlock {
  /**
   * The owning primitive: an `fs:Section` in legacy mode, a `dnis:Node`
   * (kind="section") in DNIS mode. Renderers SHOULD treat this as
   * opaque — read field-derived values (title, status, description,
   * number) from the SectionBlock surface, not from the primitive.
   */
  section: PrimitiveInstance;
  /**
   * Legacy mode: integer parsed from `fs:Section.number`.
   * DNIS mode: dotted string ("1", "1.2", "1.2.3") derived from the
   * dnis:Node DFS path. Renderers interpolate this verbatim.
   */
  number: number | string;
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
const DNIS_DOCUMENT_TYPE = "dnis:Document";
const DNIS_NODE_TYPE = "dnis:Node";

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
    findings: [],
  };
}

/**
 * DNIS-backed sibling of `buildDocumentTree`. When the project carries a
 * `dnis:Document` plus one or more active `dnis:Node` primitives of
 * kind="section", the DNIS Node graph is the canonical section tree
 * (see SPEC-CORE 1.2 §5.6 / SPEC-SECTIONS-TREE v0.2). Sibling order
 * comes from SPEC-DNIS Position; section numbers are dotted strings
 * derived from the DFS path.
 *
 * Output shape matches `buildDocumentTree` exactly so the three
 * renderers (markdown / html / pdf) consume both modes via the same
 * `SectionBlock` interface — only `block.number` widens to `string`.
 *
 * Membership: a primitive is anchored to a DNIS section when an
 * `fs:ContainedIn` relation targets the dnis:Node's bare NID (= its
 * `uid` per the SPEC-CORE §5.6.1 NID==uid pin) OR when its `scope_id`
 * equals the dnis:Node's `id`. The fallback rules mirror legacy mode.
 */
export function buildDocumentTreeFromDnis(
  input: RenderInput,
  dnisSections: readonly PrimitiveInstance[],
): DocumentTree {
  // Group children by parent_node_id. Empty string = root-level
  // siblings (matches DnisHostAdapter's `node.parentNodeId ?? ""` write
  // contract; see src/core/dnis/adapter.ts).
  const byParentNid = new Map<string, PrimitiveInstance[]>();
  for (const n of dnisSections) {
    const parent = String(n.field_values["parent_node_id"] ?? "");
    if (!byParentNid.has(parent)) byParentNid.set(parent, []);
    byParentNid.get(parent)!.push(n);
  }
  for (const [, group] of byParentNid) {
    group.sort((a, b) =>
      String(a.field_values["position"] ?? "").localeCompare(
        String(b.field_values["position"] ?? ""),
      ),
    );
  }

  // DFS yields a flat list of (node, dotted-number) pairs, preserving
  // document order. The SectionBlock surface stays flat (matches legacy
  // mode and the existing renderer flatness) — depth shows up only in
  // the dotted number.
  const ordered: { node: PrimitiveInstance; number: string }[] = [];
  function dfs(parentNid: string, ancestorPath: number[]): void {
    const children = byParentNid.get(parentNid) ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i]!;
      const path = [...ancestorPath, i + 1];
      ordered.push({ node: child, number: path.join(".") });
      dfs(child.uid, path);
    }
  }
  dfs("", []);

  // Membership: fs:ContainedIn targets either the dnis:Node uid (NID)
  // or its slug-shaped primitive id; accept both for ergonomics.
  const sectionByUid = new Map<string, PrimitiveInstance>();
  const sectionById = new Map<string, PrimitiveInstance>();
  for (const o of ordered) {
    sectionByUid.set(o.node.uid, o.node);
    sectionById.set(o.node.id, o.node);
  }
  const sectionByScopeId = new Map<string, string>();
  for (const o of ordered) {
    if (o.node.scope_id) sectionByScopeId.set(o.node.scope_id, o.node.id);
  }

  const containedIn = new Map<string, string>();
  for (const r of input.relations) {
    if (r.type_id !== CONTAINED_IN) continue;
    let targetId: string | undefined;
    if (sectionByUid.has(r.target_id)) targetId = sectionByUid.get(r.target_id)!.id;
    else if (sectionById.has(r.target_id)) targetId = r.target_id;
    if (!targetId) continue;
    if (!containedIn.has(r.source_id)) containedIn.set(r.source_id, targetId);
  }

  const buckets = new Map<string, PrimitiveInstance[]>();
  for (const o of ordered) buckets.set(o.node.id, []);
  const citations: PrimitiveInstance[] = [];
  const unsectioned: PrimitiveInstance[] = [];

  for (const p of input.primitives) {
    if (p.type_id === SECTION_TYPE) continue;
    if (p.type_id === DNIS_DOCUMENT_TYPE) continue;
    if (p.type_id === DNIS_NODE_TYPE) continue;
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

  const blocks: SectionBlock[] = ordered.map((o) => {
    const content = parseDnisContent(o.node);
    const block: SectionBlock = {
      section: o.node,
      number: o.number,
      title: content.title || o.node.id,
      primitives: buckets.get(o.node.id) ?? [],
    };
    if (content.status) block.status = content.status;
    if (content.description) block.description = content.description;
    return block;
  });

  return {
    project_id: input.projectId,
    profile: input.profile,
    sections: blocks,
    unsectioned,
    citations,
    findings: [],
  };
}

interface DnisSectionContent {
  title: string;
  status?: string;
  description?: string;
}

/**
 * `dnis:Node.content` is a JSON-encoded string per SPEC-DNIS §5.3. For
 * formal_specification sections the supported keys are `title` (string,
 * required), `status` (string, optional), `description` (string,
 * optional). Unknown keys are ignored; malformed JSON falls back to a
 * blank record so the renderer surfaces an id rather than crashing.
 */
function parseDnisContent(node: PrimitiveInstance): DnisSectionContent {
  const raw = node.field_values["content"];
  if (typeof raw !== "string") return { title: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { title: "" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { title: "" };
  }
  const obj = parsed as Record<string, unknown>;
  const out: DnisSectionContent = {
    title: typeof obj["title"] === "string" ? obj["title"] : "",
  };
  if (typeof obj["status"] === "string") out.status = obj["status"];
  if (typeof obj["description"] === "string") out.description = obj["description"];
  return out;
}

/**
 * Mode-detecting front-door for the three renderers. Picks the DNIS
 * path when the project carries a `dnis:Document` plus one or more
 * active `dnis:Node` primitives of kind="section"; otherwise falls
 * back to the legacy `fs:Section` path. When BOTH are present, the
 * DNIS path wins and the returned tree carries a `mixed-mode-sections`
 * finding so the renderer can surface it to the operator.
 */
export function buildDocumentTreeAuto(input: RenderInput): DocumentTree {
  const dnisRoot = input.primitives.find((p) => p.type_id === DNIS_DOCUMENT_TYPE);
  const dnisSections = dnisRoot
    ? input.primitives.filter(
        (p) =>
          p.type_id === DNIS_NODE_TYPE &&
          String(p.field_values["kind"] ?? "") === "section" &&
          !String(p.field_values["retired_at"] ?? ""),
      )
    : [];
  const legacySections = input.primitives.filter((p) => p.type_id === SECTION_TYPE);

  if (dnisSections.length > 0) {
    const tree = buildDocumentTreeFromDnis(input, dnisSections);
    if (legacySections.length > 0) {
      tree.findings.push({
        kind: "render-error",
        templateId: "fs:render:mixed-mode-sections",
        line: 0,
        column: 0,
        expression: "fs:render:mixed-mode-sections",
        message:
          `project contains ${dnisSections.length} dnis:Node section(s) AND ` +
          `${legacySections.length} fs:Section primitive(s); the DNIS path is ` +
          `canonical and the fs:Section primitives will be ignored. Migrate ` +
          `the legacy primitives or remove them.`,
      });
    }
    return tree;
  }

  return buildDocumentTree(input);
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
