/**
 * The document a DNIS workbook describes, read as a document.
 *
 * DNIS stores a document as a flat set of `dnis:Node` primitives whose shape
 * is a tree only in the graph: `parent_node_id` names the parent's NID and
 * `position` is a fractional index that orders siblings. Nothing about that
 * is legible in a field table — the numbering the reader expects (§2.3.1)
 * exists nowhere in the data and has to be walked out of the graph.
 *
 * Two things this renderer will not do. It does not silently drop a node
 * whose parent it cannot find: a node with a dangling `parent_node_id` is a
 * real defect in the workbook, and a renderer that hid it would make the
 * document look complete when it is not — such nodes are rendered under
 * their own heading. And it does not renumber around retired nodes without
 * saying so; the count of what was left out is stated.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";

export const DNIS_OUTLINE_RENDERER_ID = "dnis:DocumentOutlineRenderer";
export const DNIS_OUTLINE_TARGET = "text/markdown";

interface NodeView {
  /** Primitive id, for the reader to look the node up by. */
  id: string;
  /** The DNIS NID — SPEC-DNIS §5.3 requires it to equal the primitive uid. */
  nid: string;
  /** Stable DocumentId of the owning `dnis:Document`. */
  document: string;
  parent: string;
  position: string;
  kind: string;
  title: string;
  body: string | null;
  retired: boolean;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * A node's content is a JSON-serialized string whose shape `kind` decides,
 * so the renderer reads it defensively: a heading if one is there, prose if
 * that is there, and the raw payload when it recognises neither. Guessing
 * further would be inventing structure the profile did not declare.
 */
function readContent(raw: string): { title: string | null; body: string | null } {
  if (raw.trim() === "") return { title: null, body: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON at all. The node still has content and the reader should see
    // it rather than an error about its encoding.
    return { title: null, body: raw };
  }
  if (typeof parsed === "string") return { title: null, body: parsed };
  if (parsed === null || typeof parsed !== "object") return { title: null, body: String(parsed) };
  const obj = parsed as Record<string, unknown>;
  const title =
    ["title", "heading", "label"].map((k) => obj[k]).find((v) => typeof v === "string" && v !== "") ??
    null;
  const body =
    ["text", "body", "prose", "content"].map((k) => obj[k]).find((v) => typeof v === "string") ??
    null;
  if (title === null && body === null) return { title: null, body: JSON.stringify(parsed) };
  return { title: title as string | null, body: body as string | null };
}

function toView(p: {
  id: string;
  uid: string;
  field_values: Record<string, unknown>;
}): NodeView {
  const { title, body } = readContent(asString(p.field_values["content"]));
  const kind = asString(p.field_values["kind"]) || "node";
  return {
    id: p.id,
    nid: p.uid,
    document: asString(p.field_values["document_id"]),
    parent: asString(p.field_values["parent_node_id"]),
    position: asString(p.field_values["position"]),
    kind,
    title: title ?? (body !== null && body.trim() !== "" ? firstLine(body) : kind),
    body,
    retired: asString(p.field_values["retired_at"]).trim() !== "",
  };
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** Fractional indices are designed to sort as strings; ties fall back to NID. */
function bySiblingOrder(a: NodeView, b: NodeView): number {
  return a.position.localeCompare(b.position) || a.nid.localeCompare(b.nid);
}

export function renderDocumentOutline(input: RendererInput): RendererOutput {
  const documents = input.primitives.filter((p) => p.type_id === "dnis:Document");
  const nodes = input.primitives.filter((p) => p.type_id === "dnis:Node").map(toView);
  const byNid = new Map(nodes.map((n) => [n.nid, n]));

  const out: string[] = [];
  const name = input.workbook?.name ?? input.workbookId;
  out.push(`# ${name}`);
  out.push("");

  if (documents.length === 0 && nodes.length === 0) {
    out.push("This workbook holds no DNIS document.");
    return done(out, name);
  }

  for (const doc of documents) {
    renderOneDocument(out, doc, nodes, byNid);
  }

  // Nodes that name no document we hold. They are still content, and a
  // reader looking for them must be told they exist.
  const known = new Set(documents.map((d) => d.id));
  const orphanDocs = nodes.filter((n) => !known.has(n.document));
  if (orphanDocs.length > 0) {
    out.push(`## Nodes with no document in this workbook`);
    out.push("");
    out.push(
      `${orphanDocs.length} ${orphanDocs.length === 1 ? "node names a" : "nodes name a"} \`document_id\` that this workbook does not contain.`,
    );
    out.push("");
    for (const n of orphanDocs.sort(bySiblingOrder)) {
      out.push(`- \`${n.id}\` — ${n.title}`);
    }
    out.push("");
  }

  return done(out, name);
}

function renderOneDocument(
  out: string[],
  doc: { id: string; field_values: Record<string, unknown> },
  allNodes: NodeView[],
  byNid: Map<string, NodeView>,
): void {
  const mine = allNodes.filter((n) => n.document === doc.id);
  const active = mine.filter((n) => !n.retired);
  const retired = mine.length - active.length;

  out.push(`## ${doc.id}`);
  out.push("");
  const meta: string[] = [];
  const schema = asString(doc.field_values["schema_version"]);
  const algo = asString(doc.field_values["hash_algorithm"]);
  const nid = asString(doc.field_values["nid_format"]);
  if (schema !== "") meta.push(`SPEC-DNIS ${schema}`);
  if (algo !== "") meta.push(`hashes ${algo}`);
  if (nid !== "") meta.push(`ids ${nid}`);
  meta.push(`${active.length} active ${active.length === 1 ? "node" : "nodes"}`);
  if (retired > 0) meta.push(`${retired} retired, not shown`);
  out.push(`> ${meta.join(" · ")}`);
  out.push("");

  if (active.length === 0) {
    out.push("This document has no active node.");
    out.push("");
    return;
  }

  const children = new Map<string, NodeView[]>();
  const dangling: NodeView[] = [];
  for (const node of active) {
    const parent = node.parent;
    if (parent !== "" && !byNid.has(parent)) {
      dangling.push(node);
      continue;
    }
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }

  // A parent chain that loops is invalid, and invalid data reaches
  // renderers. The walk visits each node at most once so a cycle in the
  // workbook is a finite document with a note, never a hung render.
  const visited = new Set<string>();
  const looped: NodeView[] = [];
  const walk = (parentNid: string, prefix: number[]): void => {
    const siblings = (children.get(parentNid) ?? []).sort(bySiblingOrder);
    siblings.forEach((node, i) => {
      if (visited.has(node.nid)) {
        looped.push(node);
        return;
      }
      visited.add(node.nid);
      const number = [...prefix, i + 1];
      out.push(`### §${number.join(".")} ${node.title}`);
      out.push("");
      out.push(`\`${node.id}\` · ${node.kind}`);
      out.push("");
      if (node.body !== null && node.body.trim() !== "" && node.body !== node.title) {
        out.push(node.body);
        out.push("");
      }
      walk(node.nid, number);
    });
  };
  walk("", []);

  if (looped.length > 0) {
    out.push(`### Nodes in a parent cycle`);
    out.push("");
    out.push(
      `${looped.length} ${looped.length === 1 ? "node was" : "nodes were"} reached twice while walking \`parent_node_id\`, so the chain loops and the document below is truncated at the loop.`,
    );
    out.push("");
    for (const node of looped.sort(bySiblingOrder)) {
      out.push(`- \`${node.id}\` — ${node.title}`);
    }
    out.push("");
  }

  if (dangling.length > 0) {
    out.push(`### Unattached nodes`);
    out.push("");
    out.push(
      `${dangling.length} ${dangling.length === 1 ? "node names a parent" : "nodes name a parent"} that is not in this workbook, so ${dangling.length === 1 ? "it has" : "they have"} no place in the numbering above.`,
    );
    out.push("");
    for (const node of dangling.sort(bySiblingOrder)) {
      out.push(`- \`${node.id}\` — ${node.title} (parent \`${node.parent}\`)`);
    }
    out.push("");
  }
}

function done(out: string[], name: string): RendererOutput {
  const text = out.join("\n");
  return {
    bytes: new TextEncoder().encode(text.endsWith("\n") ? text : `${text}\n`),
    contentType: DNIS_OUTLINE_TARGET,
    filename: `${name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document"}.md`,
  };
}
