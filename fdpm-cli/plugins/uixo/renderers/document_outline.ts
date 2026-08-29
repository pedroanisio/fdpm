/**
 * Two markdown renderers for profile:uixo:1.2.
 *
 * `renderClassTable` is the field table — one section per class present in
 * the workbook. It replaces what would otherwise have been 712 generated
 * per-class renderers; it dispatches on each primitive's own `type_id`.
 *
 * `renderDocumentOutline` is the document view: the containment tree the
 * ontology encodes as `hasChildComponent`, walked through the relations
 * rather than through fields, with each node's other edges summarised.
 * This is the renderer a reviewer wants — the edges are the model, and a
 * field table cannot show them.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { relationTypeId } from "../derive.js";

interface P {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
interface R {
  type_id: string;
  source_id: string;
  target_id: string;
}

const CHILD = relationTypeId("hasChildComponent");
const PARENT = relationTypeId("parentComponent");

const s = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function cell(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.map(String).join(", ");
  if (typeof v === "object") return "`" + JSON.stringify(v) + "`";
  return String(v).replace(/\|/g, "\\|");
}

/** `uixo:Button` from the entity's own `type` field, falling back to the type id. */
function className(p: P): string {
  return s(p.field_values["type"]) ?? p.type_id;
}

function display(p: P): string {
  const label = s(p.field_values["label"]);
  const id = s(p.field_values["id"]) ?? p.id;
  return label ? `${label} \`${id}\`` : `\`${id}\``;
}

export function renderClassTable(input: RendererInput): RendererOutput {
  const primitives = (input.primitives as unknown as P[])
    .slice()
    .sort((a, b) => a.type_id.localeCompare(b.type_id) || a.id.localeCompare(b.id));

  const lines: string[] = [`# UIXO entities — \`${input.workbookId}\``, ""];
  if (primitives.length === 0) {
    lines.push("_(no uixo primitives in this workbook)_", "");
    return out(lines, "uixo-entities.md");
  }

  let current = "";
  for (const p of primitives) {
    if (p.type_id !== current) {
      current = p.type_id;
      lines.push(`## ${className(p)}`, "");
    }
    lines.push(`### ${display(p)}`, "");
    lines.push(`| Field | Value |`, `| --- | --- |`);
    for (const [k, v] of Object.entries(p.field_values)) {
      if (k === "id" || k === "type") continue;
      if (v === undefined) continue;
      lines.push(`| \`${k}\` | ${cell(v)} |`);
    }
    lines.push("");
  }
  return out(lines, "uixo-entities.md");
}

export function renderDocumentOutline(input: RendererInput): RendererOutput {
  const primitives = input.primitives as unknown as P[];
  const relations = input.relations as unknown as R[];
  const byId = new Map(primitives.map((p) => [p.id, p]));

  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const r of relations) {
    if (r.type_id === CHILD) {
      children.set(r.source_id, [...(children.get(r.source_id) ?? []), r.target_id]);
      hasParent.add(r.target_id);
    } else if (r.type_id === PARENT) {
      children.set(r.target_id, [...(children.get(r.target_id) ?? []), r.source_id]);
      hasParent.add(r.source_id);
    }
  }

  /** Every non-containment edge leaving a node, grouped by property. */
  const otherEdges = new Map<string, Map<string, string[]>>();
  for (const r of relations) {
    if (r.type_id === CHILD || r.type_id === PARENT) continue;
    const prop = r.type_id.replace(/^uixo:rel\./, "");
    const forNode = otherEdges.get(r.source_id) ?? new Map<string, string[]>();
    forNode.set(prop, [...(forNode.get(prop) ?? []), r.target_id]);
    otherEdges.set(r.source_id, forNode);
  }

  const lines: string[] = [`# UIXO document — \`${input.workbookId}\``, ""];
  lines.push(
    `_${primitives.length} entities, ${relations.length} edges, on \`${input.profile.id}\`._`,
    "",
  );

  const roots = primitives
    .filter((p) => !hasParent.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (primitives.length === 0) {
    lines.push("_(no uixo primitives in this workbook)_", "");
    return out(lines, "uixo-document.md");
  }

  // Containment is a tree, but a malformed document may still cycle; the
  // visited set is what keeps this renderer total rather than hanging.
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (seen.has(id)) {
      lines.push(`${"  ".repeat(depth)}- ↺ _(already shown: \`${id}\`)_`);
      return;
    }
    seen.add(id);
    const p = byId.get(id);
    if (!p) return;
    const indent = "  ".repeat(depth);
    const order = p.field_values["orderIndex"];
    lines.push(
      `${indent}- **${className(p)}** ${display(p)}${order === undefined ? "" : ` _(order ${String(order)})_`}`,
    );
    const edges = otherEdges.get(id);
    if (edges) {
      for (const [prop, targets] of [...edges.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const names = targets
          .map((t) => {
            const tp = byId.get(t);
            return tp ? (s(tp.field_values["label"]) ?? s(tp.field_values["id"]) ?? t) : t;
          })
          .sort();
        lines.push(`${indent}  - _${prop}:_ ${names.join(", ")}`);
      }
    }
    for (const kid of (children.get(id) ?? []).slice().sort()) walk(kid, depth + 1);
  };

  for (const root of roots) walk(root.id, 0);

  const orphaned = primitives.filter((p) => !seen.has(p.id));
  if (orphaned.length > 0) {
    lines.push("", `## Unreachable from any root (${orphaned.length})`, "");
    for (const p of orphaned.sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- **${className(p)}** ${display(p)}`);
    }
  }
  lines.push("");
  return out(lines, "uixo-document.md");
}

function out(lines: string[], filename: string): RendererOutput {
  return {
    bytes: new TextEncoder().encode(lines.join("\n")),
    contentType: "text/markdown",
    filename,
  };
}
